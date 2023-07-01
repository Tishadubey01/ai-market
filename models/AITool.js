
const mongoose = require('mongoose');

const aiToolSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  ratings: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      rating: {
        type: Number,
        required: true,
        min:1,
        max:5,
      },
    },
  ],
  averageRating: {
    type: Number,
    default: 0,
    },
  reviews: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      review: {
        type: String,
        required: true,
      },
    },
  ],
});

aiToolSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('AITool', aiToolSchema);

  