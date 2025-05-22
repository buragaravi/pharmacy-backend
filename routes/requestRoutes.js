const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const authenticate = require('../middleware/authMiddleware');
const authorizeRole = require("../middleware/roleMiddleware");
const { validateChemicalRequest, validateId, validateRequestApproval } = require('../middleware/validators');

// Experiment-related routes
router.get('/experiments', 
  authenticate, 
  requestController.getExperimentsForRequest
);

router.get('/experiments/:experimentId/suggested-chemicals', 
  authenticate, 
  requestController.getSuggestedChemicalsForExperiment
);

// Request CRUD routes
router.post('/', 
  authenticate, 
  authorizeRole(['faculty']), 
  validateChemicalRequest, 
  requestController.createRequest
);

router.get('/', 
  authenticate, 
  authorizeRole(['lab_assistant', 'central_lab_admin']), 
  requestController.getAllRequests
);

router.get('/faculty', 
  authenticate, 
  authorizeRole(['faculty']), 
  requestController.getRequestsByFacultyId
);

router.get('/lab/:labId', 
  authenticate, 
  authorizeRole(['lab_assistant', 'central_lab_admin']), 
  requestController.getRequestsByLabId
);

router.get('/:id', 
  authenticate, 
  requestController.getRequestById
);



router.delete('/:id', 
  authenticate, 
  authorizeRole(['faculty']), 
  requestController.deleteRequest                 
);

// Request status management routes
router.put('/approve', 
    authenticate, 
    requestController.approveRequest
  );

router.put('/:id/reject', 
  authenticate, 
  authorizeRole(['lab_assistant', 'central_lab_admin']), 
  requestController.rejectRequest
);

router.put('/:id/allocate', 
  authenticate, 
  authorizeRole(['lab_assistant', 'central_lab_admin']), 
  requestController.allocateChemicals
);

router.put('/:id/complete', 
  authenticate, 
  authorizeRole(['lab_assistant', 'central_lab_admin']), 
  requestController.completeRequest
);

router.post('/fulfill-remaining', 
  authenticate, 
  authorizeRole(['lab_assistant', 'central_lab_admin']), 
  requestController.fulfillRemaining
);

module.exports = router;