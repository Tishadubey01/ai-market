
const express = require('express');
const cors= require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const config = require('./config');
const app = express();

app.use(express.json());
app.use(cors());
const PORT = process.env.PORT || 5000;

// Database connection
const MONGO_URI =
  'mongodb+srv://hello:hello@cluster0.xsrhrwv.mongodb.net/?retryWrites=true&w=majority';

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connected to the database');
  })
  .catch((error) => {
    console.error('Error connecting to the database', error);
  });

// User model
const User = require('./models/User');
const AITool = require('./models/AITool');

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwtSecret);
    const userId = decoded.user.id;
    //const user = await User.findById(decoded.user.id);
    const user = await User.findById(userId);
    if (!user) {
      throw new Error();
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

// Authentication routes
app.post(
  '/api/auth/register',
  [
    check('username', 'Username is required').not().isEmpty(),
    check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;

      let user = await User.findOne({ username });
      if (user) {
        return res.status(400).json({ message: 'Username already exists' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      user = new User({
        username,
        password: hashedPassword,
        isSubscribed: false,
      });

      await user.save();

      const payload = {
        user: {
          id: user.id,
        },
      };

      jwt.sign(
        payload,
        config.jwtSecret,
        { expiresIn: 3600 },
        (error, token) => {
          if (error) throw error;
          res.json({ token });
        }
      );
    } catch (error) {
      console.error(error.message);
      res.status(500).send('Server Error');
    }
  }
);

app.post(
  '/api/auth/login',
  [
    check('username', 'Username is required').not().isEmpty(),
    check('password', 'Password is required').exists(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;

      let user = await User.findOne({ username });
      if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const payload = {
        user: {
          id: user.id,
        },
      };

      jwt.sign(
        payload,
        config.jwtSecret,
        { expiresIn: 3600 },
        (error, token) => {
          if (error) throw error;
          res.json({ token });
        }
      );
    } catch (error) {
      console.error(error.message);
      res.status(500).send('Server Error');
    }
  }
);
app.post('/api/payment/create', authenticateUser, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    // Check if the user is logged in
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

     

    if (amount>=250) {
      // Update the user's subscription status
      await User.findByIdAndUpdate(userId, { isSubscribed: true });
      res.json({ message: 'Payment successful. User is subscribed.' });
    } else {
      res.json({ message: 'Amount should be atleast 250INR fir the subscription.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
});
app.post('/api/ai-tools', authenticateUser, async (req, res) => {
  try {
  

    const { name, description,isPaid,toolWebsite } = req.body;
    const user = await User.findById(req.user.id);
    if(!user.isSubscribed){
      return res.status(403).json({ msg: 'Be a subscription member to access this tool' });
    }
    const newAITool = new AITool({
      name,
      description,
      isPaid,
      toolWebsite,
      ratings: [],
      reviews: [],
    });

    await newAITool.save();

    res.json(newAITool);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});
// AI Tool routes
app.get('/api/ai-tools', authenticateUser, async (req, res) => {
  try {
    const keyword = req.query.query;

    let tools;
    if (keyword) {
      tools = await AITool.find({ $text: { $search: keyword } }).sort({ name: 1 });
    } else {
      tools = await AITool.find().sort({ name: 1 });
    }

    res.json(tools);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});


// Fuzzy search
app.get('/api/ai-tools/search', authenticateUser, async (req, res) => {
  try {
    const keyword = req.query.query;

    const tools = await AITool.find({ $text: { $search: keyword } }).sort({ name: 1 });

    res.json(tools);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

app.post('/api/ai-tools/:id/rate', authenticateUser, async (req, res) => {
  try {
    const toolId = req.params.id;
    const userId = req.user.id;
    const { rating } = req.body;

    const tool = await AITool.findById(toolId);

    if (!tool) {
      return res.status(404).json({ msg: 'AI tool not found' });
    }

    const existingRating = tool.ratings.find((r) => r.user.toString() === userId);

    if (existingRating) {
      return res.status(400).json({ msg: 'You have already rated this AI tool' });
    }

    tool.ratings.push({ user: userId, rating });

    const totalRatings = tool.ratings.length;
    const totalRatingSum = tool.ratings.reduce((sum, r) => sum + r.rating, 0);
    tool.averageRating = totalRatingSum / totalRatings;

    await tool.save();

    res.json(tool);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

app.post('/api/ai-tools/:id/reviews', authenticateUser, async (req, res) => {
    try {
      const toolId = req.params.id;
      const userId = req.user.id;
      const { review } = req.body;
  
      // Find the AI tool by ID
      const tool = await AITool.findById(toolId);
  
      if (!tool) {
        return res.status(404).json({ msg: 'AI tool not found' });
      }
  
      // Check if the user has already reviewed the tool
      const existingReview = tool.reviews.find((r) => r.user.toString() === userId);
  
      if (existingReview) {
        return res.status(400).json({ msg: 'You have already reviewed this AI tool' });
      }
  // Check subscription status
  // const isSubscribed = req.user.isSubscribed;
  // if (tool.isPaid && !isSubscribed) {
  //   return res.status(403).json({ msg: 'Be a subscription member to access this tool' });
  // }
      // Add the new review to the tool's reviews array
      tool.reviews.push({ user: userId, review });
  
      // Save the updated AI tool
      await tool.save();
  
      res.json(tool);
    } catch (error) {
      console.error(error.message);
      res.status(500).send('Server Error');
    }
  });
  app.get('/api/ai-tools/:id/reviews',authenticateUser, async (req, res) => {
    try {
      const toolId = req.params.id;
      const tool = await AITool.findById(toolId).populate('reviews.user', 'name');
      
      if (!tool) {
        return res.status(404).json({ msg: 'AI tool not found' });
      }
      
      res.json(tool.reviews);
    } catch (error) {
      console.error(error.message);
      res.status(500).send('Server Error');
    }
  });
  
// New API route for fetching user data
app.get('/api/user', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});


app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
