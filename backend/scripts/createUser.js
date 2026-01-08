import mongoose from 'mongoose';
import User from '../models/User.js';

await mongoose.connect('mongodb://127.0.0.1:27017/oto-dial');

await User.create({
  email: 'test@oto.com',
  password: '123456',
});

console.log('User created successfully');
process.exit();
