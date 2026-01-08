import mongoose from "mongoose";

const connectDB = async () => {
  console.log("MONGODB_URI =", process.env.MONGODB_URI);

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB Connected");
};

export default connectDB;
