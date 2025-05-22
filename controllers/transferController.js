const Transfer = require('../models/Transfer');
const Notification = require('../models/Notification');
const { logTransaction } = require('../utils/transactionLogger');

// Create a new transfer request
exports.createTransfer = async (req, res) => {
  try {
    const { fromLabId, toLabId, chemicalsTransferred } = req.body;
    const { userId } = req.user; // Assuming userId is provided from the authentication middleware

    if (!fromLabId || !toLabId || !chemicalsTransferred) {
      return res.status(400).json({ msg: 'Missing required fields' });
    }

    // Validate each chemical in chemicalsTransferred array
    for (let chemical of chemicalsTransferred) {
      if (!chemical.chemicalMasterId || !chemical.quantity || !chemical.unit) {
        return res.status(400).json({ msg: 'Each chemical must have chemicalMasterId, quantity, and unit' });
      }
    }

    const newTransfer = new Transfer({
      fromLabId,
      toLabId,
      chemicalsTransferred,
      status: 'Pending',
      createdBy: userId,
      createdAt: new Date(),
    });

    await newTransfer.save();

    const newNotification = new Notification({
      userId: 'central_lab_admin',  // Replace with actual admin or role ID
      message: `New transfer request from lab ${fromLabId} to lab ${toLabId} awaiting approval.`,
      type: 'Transfer Pending',
    });
    await newNotification.save();

    res.status(201).json({ msg: 'Transfer request created successfully and awaiting approval' });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Approve or reject a transfer request
exports.approveTransfer = async (req, res) => {
  try {
    const { transferId, status } = req.body;
    const { userId } = req.user;

    if (!transferId || !status) {
      return res.status(400).json({ msg: 'Missing transferId or status' });
    }

    const transfer = await Transfer.findById(transferId);
    if (!transfer) {
      return res.status(404).json({ msg: 'Transfer request not found' });
    }

    transfer.status = status;
    await transfer.save();

    await logTransaction({
      transferId,
      status,
      adminId: userId,
      action: 'Approval/Reject',
      date: new Date(),
    });

    const notificationMessage = `The transfer request from lab ${transfer.fromLabId} to lab ${transfer.toLabId} has been ${status}.`;
    const newNotification = new Notification({
      userId: transfer.createdBy,
      message: notificationMessage,
      type: 'Transfer Status Update',
    });
    await newNotification.save();

    res.status(200).json({ msg: `Transfer request ${status} successfully` });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Add this for getting transfer history (optional, depending on use case)
exports.getTransferHistory = async (req, res) => {
  try {
    const transfers = await Transfer.find({}).populate('createdBy');
    res.status(200).json(transfers);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};
