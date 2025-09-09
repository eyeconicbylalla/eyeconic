import React from 'react';
import { motion } from 'framer-motion';

const PrivacyPolicy: React.FC = () => {
  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-3xl font-bold text-center mb-8"
        >
          Privacy Policy
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white p-8 rounded-xl shadow-sm"
        >
          <p className="mb-4">
            Please read this Privacy Policy carefully. It applies to all users who access or use the services offered on https://eyeconicbylalla.com/ or any equivalent platform or mobile interface operated by Eyeconic by Lalla (“Platform”).
          </p>
          <p className="mb-4">
            For purposes of this Privacy Policy, the terms "You", "Your" or "User" shall mean any natural or legal person who browses the Platform or registers for mentorship or related services offered through the Platform. The terms "We", "Us", or "Our" refer to Eyeconic by Lalla, its administrators, and authorized representatives.
          </p>
          <p className="mb-4">
            Please ensure that this Privacy Policy is perused by You before availing any Services from Us. This Privacy Policy shall be updated from time to time and to stay abreast with our methods of using Your information and protecting Your privacy, please keep reviewing this Policy. If we decide to change our Privacy Policy, We will post those changes on this page so that You are always aware of what information We collect, how We use it, and under what circumstances We disclose it. If You do not agree for the foregoing, please do not continue to use or access our Website. In the event You discontinue Your consent for sharing any Information as required herein or retract Your consent at a subsequent date, We reserve the right to, at our sole discretion, discontinue or restrict Your access to the Platform, and in such event We will not be liable for any payment or refund on such account. We may review and change this Policy from time to time to reflect changes in the law, our business practices, processes or structure. This Policy does not suggest any obligation on our part with another party.
          </p>
          <p className="mb-4">
            By accessing or using the Platform, You agree to the collection, storage, and use of Your personal data as described in this Privacy Policy. If You do not agree, please do not continue to use the Platform.
          </p>
          <h2 className="text-2xl font-semibold mb-4">1. Applicability</h2>
          <p className="mb-4">This Policy applies to:</p>
          <ol className="list-decimal list-inside mb-4">
            <li>All Users, whether registered or browsing the Platform.</li>
            <li>All services, programs, and content offered through the Platform.</li>
            <li>All modes of access, including desktop, mobile, and third-party applications.</li>
          </ol>
          <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
          <p className="mb-4">
            When you interact with the Platform or register for mentorship, the Platform may collect and process a variety of personal, technical, and usage-related information to deliver and improve its services. This includes personal details such as your full name, email address, contact number, city and state of residence, academic information (including current class, target examination, and institution name), as well as your profile photo or identification document if required for verification purposes.
          </p>
          <p className="mb-4">
            Additionally, communication history between you and the Platform may be stored. Technical and usage information may also be automatically collected, including your IP address, browser and device specifications, session logs, activity tracking data, and information gathered through cookies and similar technologies.
          </p>
          <p className="mb-4">
            We do not collect sensitive personal data like financial information, biometric data, medical records, or passwords unless explicitly required for identity verification with proper consent.
          </p>
          <h2 className="text-2xl font-semibold mb-4">3. Use of Personal Information</h2>
          <p className="mb-4">Your personal information may be used to:</p>
          <ol className="list-decimal list-inside mb-4">
            <li>Register and maintain your account</li>
            <li>Assign appropriate mentors and manage your learning journey</li>
            <li>Communicate academic updates, feedback, and notifications</li>
            <li>Respond to queries or requests</li>
            <li>Improve Platform performance and user experience</li>
            <li>Send information on new services, offers, or features comply with applicable legal obligations</li>
          </ol>
          <p className="mb-4">
            We may also perform aggregated or anonymized analysis to assess platform effectiveness, but such data does not personally identify You.
          </p>
          <h2 className="text-2xl font-semibold mb-4">4. Sharing of Information</h2>
          <p className="mb-4">We do not sell your personal data. Information may be shared in the following cases:</p>
          <ol className="list-decimal list-inside mb-4">
            <li>With mentors for providing personalized guidance</li>
            <li>With service providers (email tools, payment gateways, analytics tools) under confidentiality obligations</li>
            <li>With parents/guardians, in case the User is a minorTo comply with legal or regulatory obligations or government requests</li>
            <li>In the case of business restructuring, sale, or merger, subject to equivalent privacy protections</li>
          </ol>
          <h2 className="text-2xl font-semibold mb-4">5. Use of Cookies</h2>
          <p className="mb-4">
            Cookies are used on our Platform to enhance user experience, save preferences, analyze traffic, and personalize content. You may disable cookies in your browser settings, but certain features may become inaccessible.
          </p>
          <h2 className="text-2xl font-semibold mb-4">6. Information Security</h2>
          <p className="mb-4">
            We implement appropriate technical and organizational safeguards to protect your data from unauthorized access, misuse, or alteration. However, no method of internet transmission is entirely secure.
          </p>
          <p className="mb-4">
            You are responsible for maintaining the confidentiality of your login credentials. If You suspect any unauthorized use of your account, please notify Us immediately at grievances.eyeconic@gmail.com.
          </p>
          <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
          <p className="mb-4">
            We retain Your information for as long as necessary to provide services or as required by applicable law. If You request deletion of Your account, We will securely delete or anonymize Your personal information, unless legally restricted.
          </p>
          <h2 className="text-2xl font-semibold mb-4">8. Minor’s Privacy</h2>
          <p className="mb-4">
            Our mentorship platform is intended for students preparing for NEET and similar exams. If You are under 18, You may use our services only with the involvement and consent of a parent or legal guardian.
          </p>
          <h2 className="text-2xl font-semibold mb-4">9. Third-Party Links</h2>
          <p className="mb-4">
            The Platform may contain links to third-party websites or tools. We are not responsible for the privacy practices of such websites. Please review their privacy policies separately.
          </p>
          <h2 className="text-2xl font-semibold mb-4">10. Choice / Opt-Out</h2>
          <p className="mb-4">
            You may opt out of receiving non-essential communications or promotional emails by writing to us at grievances.eyeconic@gmail.com. Essential service updates or operational messages may still be sent.
          </p>
          <h2 className="text-2xl font-semibold mb-4">11. Updates to This Policy</h2>
          <p className="mb-4">
            We may update this Privacy Policy to reflect changes in our business or legal requirements. The latest version will always be available on this page with the "Effective Date." Your continued use of the Platform implies acceptance of the updated policy.
          </p>
          <h2 className="text-2xl font-semibold mb-4">12. Contact Us</h2>
          <p className="mb-4">
            For any questions, concerns, or data deletion requests, please contact: Email: grievances.eyeconic@gmail.com
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default PrivacyPolicy;