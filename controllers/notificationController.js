const Notification = require('../models/Notification');
const { validationResult } = require('express-validator');

// Create a new notification
exports.createNotification = async (req, res) => {
  try {
    const { userId, message, type } = req.body;

    // Validate the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const newNotification = new Notification({
      userId,
      message,
      type,
      read: false,
      createdAt: new Date()
    });

    await newNotification.save();
    res.status(201).json({ msg: 'Notification created successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ msg: 'Notification not found' });
    }

    notification.read = true;
    await notification.save();

    res.status(200).json({ msg: 'Notification marked as read' });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get notifications for a user with pagination
exports.getUserNotifications = async (req, res) => {
  try {
    const userId  = req.userId; // Get user ID from authenticated user
    const { role } = req.user; // Get user role from authenticated user
    console.log('User Role:', role, "entered into getUserNotifications");
    const { page = 1, limit = 10 } = req.query; // Pagination (default page 1, limit 10)
    console.log('User ID:', userId, "entered into getUserNotifications");

    const notifications = await Notification.find({ userId })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const totalNotifications = await Notification.countDocuments({ userId });

    res.status(200).json({
      notifications,
      pagination: {
        totalNotifications,
        currentPage: page,
        totalPages: Math.ceil(totalNotifications / limit),
        limit: limit,
      },
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};
