import dns from "dns";
import mongoose from "mongoose";

// Use reliable DNS servers (fixes ECONNREFUSED on querySrv on some Windows/networks)
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  // Log URI with password redacted for security
  const safeUri = uri?.replace(/:[^:@]+@/, ":****@");
  console.log("MONGODB_URI =", safeUri);

  if (!uri) {
    throw new Error("MONGODB_URI is missing");
  }

  await mongoose.connect(uri);
  console.log("MongoDB Connected");
};

export default connectDB;
