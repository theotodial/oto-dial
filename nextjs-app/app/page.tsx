import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">OTO-DIAL</h1>
        <p className="text-xl text-gray-600 mb-8">VoIP/SMS Platform</p>
        <div className="space-x-4">
          <Link
            href="/register"
            className="inline-block px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Sign Up
          </Link>
          <Link
            href="/login"
            className="inline-block px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

