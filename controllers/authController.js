// Controller: Authentication 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// Register a new user
exports.register = async (req, res) => {
  try {
    // Validate request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, name, email, password, role, labId } = req.body;

    // Check if email already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // For lab assistants, ensure labId is provided and not already taken
    if (role === 'lab_assistant') {
      if (!labId) {
        return res.status(400).json({ msg: 'Lab ID is required for lab assistants.' });
      }

      const labAssigned = await User.findOne({ role: 'lab_assistant', labId });
      if (labAssigned) {
        return res.status(400).json({ msg: `Lab ID ${labId} is already assigned to another lab assistant.` });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      userId,
      name,
      email,
      password: hashedPassword,
      role,
      ...(role === 'lab_assistant' && { labId }) // only include labId if role is lab_assistant
    });

    await newUser.save();
    res.status(201).json({ msg: 'User registered successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};


// Login a user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    // Update last login time
    user.lastLogin = Date.now();
    await user.save();
    console.log(user.userId, user.role)
    // Create JWT payload and send token
    const payload = {
      user: {
        id: user._id,
        userId: user.userId,
        role: user.role,
        labId: user.labId
      }
    };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { userId: user.userId, role: user.role } });
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get current logged-in user// Get current logged-in user
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};
