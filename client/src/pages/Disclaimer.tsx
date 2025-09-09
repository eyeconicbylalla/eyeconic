import React from 'react';
import { motion } from 'framer-motion';

const Disclaimer: React.FC = () => {
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
          Disclaimer
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white p-8 rounded-xl shadow-sm"
        >
          <p className="mb-4">
            The information provided on this website is for general informational purposes only. While every effort is made by Eyeconic by Lalla to ensure the accuracy, reliability, and completeness of the content available on the platform, we make no representations or warranties of any kind, express or implied, regarding the accuracy, adequacy, validity, availability, or completeness of any information on the website.
          </p>
          <p className="mb-4">
            Any reliance you place on such information is therefore strictly at your own risk. Under no circumstances shall Eyeconic by Lalla, its owners, affiliates, or team members be liable for any direct, indirect, incidental, special, or consequential loss or damage arising out of or in any way connected with the use of this website or reliance on any information provided herein.
          </p>
          <p className="mb-4">
            This website may contain links to third-party websites or services that are not owned or controlled by Eyeconic by Lalla. We do not endorse or assume any responsibility for the content, privacy policies, or practices of any third-party sites or services. The inclusion of any external links does not necessarily imply a recommendation or endorsement of the views expressed within them.
          </p>
          <p className="mb-4">
            Every effort is made to keep the website operational and accessible. However, Eyeconic by Lalla assumes no responsibility for, and will not be liable for, the website being temporarily unavailable due to technical issues beyond our control.
          </p>
          <h2 className="text-2xl font-semibold mb-4">User-Generated Content:</h2>
          <p className="mb-4">
            Any reviews, comments, testimonials, or other content posted by users on this platform reflect the views and opinions of the individual authors and do not necessarily reflect the official policy or position of Eyeconic by Lalla. We are not responsible for any content posted by users and reserve the right (but not the obligation) to remove any content deemed inappropriate, offensive, or in violation of our terms.
          </p>
          <h2 className="text-2xl font-semibold mb-4">Copyright Notice:</h2>
          <p className="mb-4">
            All content available on this website, including but not limited to text, graphics, logos, images, videos, and software, is the intellectual property of Eyeconic by Dr Lalla unless otherwise stated. Unauthorized use, reproduction, or distribution of any content without prior written consent is strictly prohibited and may give rise to legal action.
          </p>
          <p className="mb-4">
            Users are strongly advised to read the Privacy Policy, Terms and Conditions, and Refund Policy collectively before using the platform. By continuing to use the website or any associated services, you agree to be legally bound by all such terms and policies in their entirety.
          </p>
          <p className="mb-4">
            For any concerns, feedback, or grievances, you may contact us at: Email: grievances.eyeconic@gmail.com Platform: https://eyeconicbylalla.com/
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default Disclaimer;