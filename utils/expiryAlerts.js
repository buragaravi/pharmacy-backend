// Expiry Checker Job 
const ChemicalMaster = require('../models/ChemicalMaster');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const moment = require('moment');
const cron = require('node-cron');  // To schedule the expiry check task


// // Helper function to send email notifications (optional)
// const sendEmailNotification = async (email, subject, message) => {
//   const transporter = nodemailer.createTransport({
//     service: 'gmail',
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//   });

//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: email,
//     subject: subject,
//     text: message,
//   };

//   await transporter.sendMail(mailOptions);
// };

// Function to send expiry alerts
const sendExpiryAlert = async (chemical) => {
  const alertMessage = `Chemical ${chemical.ChemicalName} (Batch ID: ${chemical.batchId}) is nearing expiry. Expiry Date: ${chemical.expiryDate}`;
  
  // Save the notification to the database (notifications for admins or users)
  const notification = new Notification({
    userId: new mongoose.Types.ObjectId('6815bfe6d9560f9a781c422f'), // Assuming you have a userId field in the chemical document
    title: 'Chemical Expiry Alert',
    message: alertMessage,
    date: new Date(),
    status: 'unread',
    type: 'error'
  });

  await notification.save();

  console.log(`Expiry alert sent for ${chemical.chemicalName}`);
};

// Function to check for chemicals nearing expiry
const checkForExpiringChemicals = async () => {
  // Get all chemicals with an expiry date within 30 days
  const today = moment();
  const alertThresholdDate = today.add(30, 'days').toDate();

  // Find chemicals whose expiry date is within the threshold
  const expiringChemicals = await ChemicalMaster.find({
    expiryDate: { $lte: alertThresholdDate },
  });

  // Loop through expiring chemicals and send alerts
  expiringChemicals.forEach(async (chemical) => {
    await sendExpiryAlert(chemical);
  });
};

// Schedule the expiry check to run daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('Checking for chemicals nearing expiry...');
  checkForExpiringChemicals();
});

module.exports = { checkForExpiringChemicals };
