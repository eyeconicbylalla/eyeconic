import React from 'react';
import { motion } from 'framer-motion';

const TermsAndConditions: React.FC = () => {
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
          Terms & Conditions
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white p-8 rounded-xl shadow-sm"
        >
          <p className="mb-4">
            Welcome to Eyeconic by Lalla ("Platform", "we", "us", or "our") – a one-to-one academic mentorship platform designed to help students prepare effectively for NEET and other medical entrance examinations. These Terms and Conditions ("Terms") govern your access to and use of our website, platform, and services.
          </p>
          <p className="mb-4">
            Please read these Terms carefully before using our services. By accessing or using our Platform, you agree to be bound by these Terms. If you do not agree, please do not access or use our services.
          </p>
          <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
          <p className="mb-4">
            By registering on or accessing our Platform, you agree to be legally bound by these Terms. You also confirm that you are either above 18 years of age or using the Platform with the consent and supervision of a parent or legal guardian. You also confirm that you have ready and fully understood all the Legal Documents provided, including the Privacy Policy , User Service Agreements, Terms and Conditions, Refund Policy and any other policy that may be added and amended from time to time.
          </p>
          <h2 className="text-2xl font-semibold mb-4">2. Eligibility</h2>
          <p className="mb-4">
            Our Platform is intended for students preparing for medical entrance exams. You must provide accurate information during registration.
          </p>
          <h2 className="text-2xl font-semibold mb-4">3. Account Registration and Security</h2>
          <p className="mb-4">To access mentorship sessions, you may need to create an account by providing personal and academic details. You agree to:</p>
          <ol className="list-decimal list-inside mb-4">
            <li>Provide accurate and up-to-date information</li>
            <li>Maintain confidentiality of your login credentials</li>
            <li>Notify us immediately of any unauthorized access or security breach</li>
          </ol>
          <p className="mb-4">You are solely responsible for all activities that occur under your account.</p>
          <h2 className="text-2xl font-semibold mb-4">4. Services Offered</h2>
          <p className="mb-4">Eyeconic by Lalla provides personalized mentorship services including but not limited to:</p>
          <ol className="list-decimal list-inside mb-4">
            <li>One-on-one mentoring sessions</li>
            <li>Study planning and strategy</li>
            <li>Progress tracking</li>
            <li>Guidance for NEET and other medical entrance exams</li>
          </ol>
          <p className="mb-4">We may modify or discontinue any part of our services at our discretion without prior notice.</p>
          <h2 className="text-2xl font-semibold mb-4">5. User Conduct</h2>
          <p className="mb-4">You agree not to:</p>
          <ol className="list-decimal list-inside mb-4">
            <li>Misrepresent your identity or academic background</li>
            <li>Use the Platform for any illegal or unauthorized purpose</li>
            <li>Harass or abuse mentors or other users</li>
            <li>Record or redistribute any content from sessions</li>
            <li>Defame the Company, mentors or any of its affiliates either publicly, through online platforms including social media (e.g., Instagram, WhatsApp, Telegram, Facebook, YouTube, Reddit, Google Reviews, Quora, etc.), blogs, posts, or videos; or Privately, through communication that may cause reputational or commercial harm to the Company or its representatives</li>
          </ol>
          <p className="mb-4">Violation of these terms may lead to suspension or permanent termination of your access without refund.</p>
          <h2 className="text-2xl font-semibold mb-4">6. Intellectual Property Rights</h2>
          <p className="mb-4">
            All content on the Platform, including study materials, mentor strategies, branding, and design, is the intellectual property of Eyeconic by Lalla or its licensors. You are granted a limited, non-exclusive, non-transferable access to use such content for personal educational purposes only.
          </p>
          <p className="mb-4">
            Any reproduction, distribution, or commercial use of content is strictly prohibited and violation of the same may invite legal action.
          </p>
          <h2 className="text-2xl font-semibold mb-4">7. Pricing and Payments</h2>
          <p className="mb-4">All fees for mentorship services are clearly mentioned on the Platform. By purchasing any service:</p>
          <ol className="list-decimal list-inside mb-4">
            <li>You agree to pay the specified fees</li>
            <li>All payments are final, except as allowed under our Refund Policy</li>
            <li>Prices may be revised without prior notice</li>
          </ol>
          <p className="mb-4">You are responsible for any taxes or charges applicable to your purchase.</p>
          <h2 className="text-2xl font-semibold mb-4">8. Refund and Cancellation</h2>
          <p className="mb-4">Refunds are governed by our Refund Policy. Please review it before making any payments.</p>
          <h2 className="text-2xl font-semibold mb-4">9. Third-Party Tools and Services</h2>
          <p className="mb-4">
            We may use third-party tools for scheduling, communication, analytics, or payment processing. Your use of such tools is subject to their respective terms and privacy policies. We are not responsible for their performance or misuse.
          </p>
          <h2 className="text-2xl font-semibold mb-4">10. Limitation of Liability</h2>
          <p className="mb-4">To the fullest extent permitted by applicable law:</p>
          <ol className="list-decimal list-inside mb-4">
            <li>We do not guarantee any rank, result, or outcome in NEET or other exams</li>
            <li>We are not liable for any indirect, incidental, or consequential damages</li>
            <li>Our total liability for any claim related to the use of the Platform shall not exceed the amount paid by you for the services</li>
          </ol>
          <h2 className="text-2xl font-semibold mb-4">11. Disclaimer</h2>
          <p className="mb-4">
            The mentorship services provided are for educational support only. We do not promise or imply guaranteed results. The Platform is provided "as-is" and "as-available" without warranties of any kind.
          </p>
          <h2 className="text-2xl font-semibold mb-4">12. Termination</h2>
          <p className="mb-4">
            We reserve the right to suspend or terminate your access to the Platform, with or without notice, if you violate these Terms or act in a manner detrimental to the learning environment or other users.
          </p>
          <h2 className="text-2xl font-semibold mb-4">13. Governing Law and Jurisdiction</h2>
          <p className="mb-4">
            These terms shall be governed by and construed in accordance with the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts located in Jaipur, Rajasthan.
          </p>
          <h2 className="text-2xl font-semibold mb-4">14. Changes to Terms</h2>
          <p className="mb-4">
            We reserve the right to modify these Terms at any time. Updates will be posted on this page with a revised "Effective Date." Your continued use of the Platform constitutes your acceptance of the revised Terms.
          </p>
          <h2 className="text-2xl font-semibold mb-4">15. Contact Us</h2>
          <p className="mb-4">
            If you have any questions or concerns about these Terms, please reach out to grievances.eyeconic@gmail.com.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default TermsAndConditions;