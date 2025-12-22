import logo from '../assets/otodial-logo.png';

function Privacy() {
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
            Privacy Policy
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Last updated: 12/19/2025
          </p>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 lg:p-12 space-y-8">
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              OTO DIAL ("we", "our", "us") is committed to protecting your privacy and personal data. This Privacy Policy explains how we collect, use, process, and protect your information when you use our website, applications, and communication services (collectively, the "Service").
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              OTO DIAL is based in Stavanger, Norway, and complies with the General Data Protection Regulation (GDPR) and applicable telecommunications and payment regulations.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">1. Information We Collect</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">a) Personal Information</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Email address</li>
              <li>Name (if provided)</li>
              <li>Authentication identifiers (including Google OAuth)</li>
              <li>Unique user ID</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">b) Payment & Billing Information (Stripe)</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We do not store full payment card details.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Payment processing is handled by Stripe, which may collect:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Card details</li>
              <li>Billing address</li>
              <li>Payment method identifiers</li>
              <li>Transaction metadata</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              OTO DIAL only receives:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Payment confirmation</li>
              <li>Amount</li>
              <li>Currency</li>
              <li>Transaction ID</li>
              <li>Wallet balance updates</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              Stripe processes data according to its own Privacy Policy.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">c) Communication Data (Telnyx)</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              To provide calling and messaging services, we may process:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Purchased phone numbers</li>
              <li>Call metadata (timestamps, duration, direction)</li>
              <li>Message metadata (sender, recipient, timestamps)</li>
              <li>Message content only when required for delivery</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              We do not:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Monitor call audio content</li>
              <li>Analyze message content for advertising</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              Telnyx processes communication data according to applicable telecom regulations and its Privacy Policy.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">d) Usage & Technical Data</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>IP address</li>
              <li>Device and browser type</li>
              <li>Operating system</li>
              <li>Error logs and performance metrics</li>
              <li>Authentication session events</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">2. How We Use Your Information</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We use your data to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Create and manage user accounts</li>
              <li>Authenticate users securely</li>
              <li>Process payments and wallet top-ups</li>
              <li>Assign and manage phone numbers</li>
              <li>Enable voice calls and messaging</li>
              <li>Maintain system security and fraud prevention</li>
              <li>Comply with legal, financial, and telecom regulations</li>
              <li>Improve service reliability and performance</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4 font-semibold">
              We do not sell or rent personal data.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">3. Legal Basis for Processing (GDPR)</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We process personal data under the following legal bases:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li><strong>Contractual necessity</strong> – providing the Service</li>
              <li><strong>Legal obligation</strong> – telecom and financial compliance</li>
              <li><strong>Legitimate interests</strong> – security, fraud prevention, service stability</li>
              <li><strong>User consent</strong> – where required (OAuth login, communications)</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">4. Telecommunications Compliance (Telnyx)</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              To comply with telecom regulations:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Call and message metadata may be retained as required by law</li>
              <li>Phone numbers are assigned to verified user accounts</li>
              <li>Abuse, fraud, or unlawful usage may result in suspension</li>
              <li>We cooperate with lawful requests from authorities when required</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              Users are responsible for ensuring lawful use of calling and messaging features.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">5. Payments & Financial Compliance (Stripe)</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>All payments are processed securely by Stripe</li>
              <li>OTO DIAL never stores full card numbers or CVV codes</li>
              <li>Transactions may be monitored for fraud prevention</li>
              <li>Refunds and disputes are handled according to Stripe policies</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">6. Data Storage & Security</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Data is stored using secure, industry-standard infrastructure</li>
              <li>Access is controlled via authentication and role-based policies</li>
              <li>Sensitive data is encrypted in transit and at rest where applicable</li>
              <li>We apply reasonable safeguards to prevent unauthorized access</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">7. Data Sharing</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We may share data with:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Stripe – payment processing</li>
              <li>Telnyx – voice and messaging services</li>
              <li>Infrastructure providers – hosting, authentication, logging</li>
              <li>Authorities – if required by law</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4 font-semibold">
              We do not share data for marketing or advertising purposes.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">8. Data Retention</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We retain data only as long as necessary to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Provide the Service</li>
              <li>Meet legal, financial, and telecom obligations</li>
              <li>Resolve disputes and enforce agreements</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              Users may request account deletion unless retention is legally required.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">9. Your Rights (GDPR)</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              You have the right to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Access your personal data</li>
              <li>Request correction or deletion</li>
              <li>Restrict or object to processing</li>
              <li>Data portability</li>
              <li>Withdraw consent at any time</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              Requests can be sent to <a href="mailto:info@otodial.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">info@otodial.com</a>.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">10. Cookies & Local Storage</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We use essential cookies and local storage for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
              <li>Authentication</li>
              <li>Session management</li>
              <li>Security</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4 font-semibold">
              We do not use behavioral advertising cookies.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">11. Children's Privacy</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              OTO DIAL is not intended for users under 16 years of age.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We do not knowingly collect data from children.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">12. International Data Transfers</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              When data is transferred outside the EEA, appropriate safeguards (such as standard contractual clauses) are applied.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">13. Changes to This Policy</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We may update this Privacy Policy periodically. Updates will be posted with a revised date.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">14. Contact Information</h2>
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

export default Privacy;

