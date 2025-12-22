import logo from '../assets/otodial-logo.png';

function Terms() {
  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <img 
              src={logo} 
              alt="OTO DIAL Logo" 
              className="h-10 md:h-12 w-auto object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = e.target.nextElementSibling;
                if (fallback) fallback.classList.remove('hidden');
              }}
            />
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center hidden">
              <span className="text-white font-bold text-xl">OD</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Terms of Service
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Last updated: 12/19/2025
          </p>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 lg:p-12 space-y-8">
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              These Terms of Service ("Terms") govern your access to and use of the OTO DIAL website, applications, and services (collectively, the "Service").
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-semibold">
              By creating an account or using OTO DIAL, you agree to these Terms. If you do not agree, you must not use the Service.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">1. About OTO DIAL</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              OTO DIAL ("we", "our", "us") is a communications platform providing virtual phone numbers, voice calling, messaging, and wallet-based payments.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4 mt-4">
              <li>Company location: Stavanger, Norway</li>
              <li>Contact: <a href="mailto:info@otodial.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">info@otodial.com</a></li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">2. Eligibility</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              You must:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Be at least 18 years old</li>
              <li>Have the legal authority to enter into these Terms</li>
              <li>Use the Service in compliance with applicable laws and regulations</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              We may suspend or terminate accounts that do not meet these requirements.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">3. Account Registration & Security</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>You must provide accurate and complete information</li>
              <li>You are responsible for maintaining the security of your account</li>
              <li>You are responsible for all activity under your account</li>
              <li>You must notify us immediately of unauthorized access</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">4. Authentication</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              OTO DIAL supports:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Email/password authentication</li>
              <li>Google OAuth authentication</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              You consent to authentication data being processed to provide secure access.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">5. Services Provided</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              OTO DIAL provides:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>User accounts and authentication</li>
              <li>Wallet-based credit system</li>
              <li>Phone number purchase and management</li>
              <li>Voice calling services</li>
              <li>Messaging services</li>
              <li>Service dashboards and usage reporting</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              Services may change or evolve over time.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">6. Payments, Wallets & Billing (Stripe)</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">a) Wallet System</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Funds are added to your wallet via Stripe</li>
              <li>Wallet balances are not bank accounts</li>
              <li>Wallet funds have no cash value outside the platform</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">b) Payments</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>All payments are processed securely by Stripe</li>
              <li>We do not store full card details</li>
              <li>Prices are shown before purchase</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">c) No Refund Guarantee</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Unless required by law:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Wallet top-ups are non-refundable</li>
              <li>Used credits are not refundable</li>
              <li>Phone number purchases may be non-refundable</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">7. Phone Numbers, Calls & Messaging (Telnyx)</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">a) Phone Numbers</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Numbers are assigned, not owned</li>
              <li>Numbers may be reclaimed if unused or for compliance reasons</li>
              <li>Availability is not guaranteed</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">b) Usage Responsibility</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              You agree not to use OTO DIAL for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Spam or robocalling</li>
              <li>Fraud, phishing, or scams</li>
              <li>Harassment or abuse</li>
              <li>Illegal content or activities</li>
              <li>Circumventing telecom regulations</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">c) Compliance</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Call and message metadata may be logged</li>
              <li>Usage may be monitored to prevent abuse</li>
              <li>Accounts may be suspended for violations</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">8. Acceptable Use</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              You must not:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Violate laws or regulations</li>
              <li>Interfere with service operations</li>
              <li>Attempt to bypass security measures</li>
              <li>Misuse phone numbers or messaging</li>
              <li>Resell services without authorization</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4 font-semibold">
              Violation may result in suspension or termination without notice.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">9. Data Protection & Privacy</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Personal data is handled according to our <a href="/privacy" className="text-indigo-600 dark:text-indigo-400 hover:underline">Privacy Policy</a>.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              By using the Service, you consent to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Processing necessary to provide services</li>
              <li>Telecom compliance data retention</li>
              <li>Payment processing via Stripe</li>
              <li>Communication services via Telnyx</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">10. Service Availability</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>The Service is provided on an "as-is" and "as-available" basis</li>
              <li>We do not guarantee uninterrupted service</li>
              <li>Maintenance, outages, or third-party failures may occur</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">11. Intellectual Property</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>All content, software, and branding are owned by OTO DIAL</li>
              <li>You may not copy, modify, or distribute our materials without permission</li>
              <li>No license is granted except as necessary to use the Service</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">12. Suspension & Termination</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We may suspend or terminate your account if:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>You violate these Terms</li>
              <li>Required by law or telecom providers</li>
              <li>Your usage poses risk or harm</li>
              <li>Payment disputes or fraud occur</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              Upon termination:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Access to services will stop</li>
              <li>Wallet balances may be forfeited unless legally required otherwise</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">13. Limitation of Liability</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              To the maximum extent permitted by law:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>OTO DIAL is not liable for indirect or consequential damages</li>
              <li>We are not responsible for telecom outages or third-party failures</li>
              <li>Total liability is limited to the amount paid in the last 12 months</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">14. Indemnification</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              You agree to indemnify and hold harmless OTO DIAL from claims arising from:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Your use of the Service</li>
              <li>Violation of laws or regulations</li>
              <li>Misuse of phone numbers or messaging</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">15. Changes to Terms</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We may update these Terms from time to time.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Continued use of the Service means acceptance of updated Terms.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">16. Governing Law & Jurisdiction</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              These Terms are governed by the laws of Norway.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Any disputes shall be resolved in Norwegian courts.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">17. Contact Information</h2>
            <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-6 mt-4">
              <p className="text-gray-900 dark:text-white font-semibold text-lg mb-2">OTO DIAL</p>
              <p className="text-gray-700 dark:text-gray-300">Stavanger, Norway</p>
              <p className="text-gray-700 dark:text-gray-300 mt-2">
                📧 <a href="mailto:info@otodial.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">info@otodial.com</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Terms;

