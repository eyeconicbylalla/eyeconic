import React from 'react';
import { motion } from 'framer-motion';

const RefundPolicy: React.FC = () => {
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
          Refund Policy
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white p-8 rounded-xl shadow-sm"
        >
          <p className="mb-4">
            At Eyeconic by Lalla, we strive to deliver quality mentorship. However, due to the nature of personalized academic services, refunds are handled with caution and in accordance with this policy.
          </p>
          <h2 className="text-2xl font-semibold mb-4">1. General Policy – No Refunds</h2>
          <ol className="list-decimal list-inside mb-4">
            <li>All fees paid to Eyeconic by Dr. Lalla are strictly non-refundable and non-transferable, under any circumstances, including but not limited to change of mind, dissatisfaction, scheduling conflicts, or personal reasons. This is due to the pre-allocation of limited mentorship resources, personalized attention, and the nature of our educational content.</li>
            <li>This policy applies to, but is not limited to:</li>
            <ol className="list-decimal list-inside ml-8 mb-4">
              <li>One-on-one mentorship sessions</li>
              <li>Subscription-based mentorship packages</li>
              <li>Academic consultations or strategy sessions</li>
              <li>Promotional or bundled offers</li>
            </ol>
          </ol>
          <h2 className="text-2xl font-semibold mb-4">2. Service Expectations and User Responsibility</h2>
          <ol className="list-decimal list-inside mb-4">
            <li>We make no guarantees, promises, or warranties regarding:</li>
            <ol className="list-decimal list-inside ml-8 mb-4">
              <li>Improvement in your exam scores</li>
              <li>Success in the NEET or any specific competitive examination</li>
              <li>Compatibility or suitability of a particular mentor</li>
            </ol>
            <li>It is the User’s responsibility to attend scheduled sessions punctually, Communicate availability and rescheduling requests in advance and maintain a cooperative and respectful relationship with the mentor and support team</li>
          </ol>
          <h2 className="text-2xl font-semibold mb-4">3. Dispute and Escalation Process</h2>
          <ol className="list-decimal list-inside mb-4">
            <li>We understand that learning journeys can have ups and downs. While refunds are not possible, we are deeply invested in your growth. If you ever feel dissatisfied or face challenges, we encourage you to reach out—our team will work with you to identify the issues and offer practical solutions through dialogue, strategy adjustments, or alternate support. If you face issues with our service, please write to us at grievances.eyeconic@gmail.com.</li>
            <li>We will respond to all refund- or service-related complaints within 7 working days and work towards resolution through mutual discussion and transparency.</li>
            <li>You agree not to initiate chargebacks or public complaints without first availing of the internal redressal mechanism.</li>
          </ol>
          <h2 className="text-2xl font-semibold mb-4">4. Acknowledgment and Consent</h2>
          <p className="mb-4">
            By making a payment to Eyeconic by Lalla, you confirm that you have read, understood, and accepted this Refund Policy and agree that you are legally bound by the terms stated herein.
          </p>
          <p className="mb-4">
            You also confirm that You will not initiate chargebacks, disputes, or public defamation related to refund issues.
          </p>
          <h2 className="text-2xl font-semibold mb-4">5. Policy Amendments</h2>
          <p className="mb-4">
            We reserve the right to update this Refund Policy as per operational and legal needs. Any such changes will be reflected with the effective date above.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default RefundPolicy;