const asyncHandler = require('express-async-handler');
const Experiment = require('../models/Experiment');
const Request = require('../models/Request');

// Add new experiment
exports.addExperiment = asyncHandler(async (req, res) => {
  const { name, semester, subject, description, defaultChemicals } = req.body;

  const experiment = await Experiment.create({
    name,
    semester,
    subject,
    description,
    defaultChemicals,
    createdBy: req.userId
  });

  res.status(201).json({
    message: 'Experiment added successfully',
    experiment
  });
});

// Bulk add experiments
exports.bulkAddExperiments = asyncHandler(async (req, res) => {
  const { experiments } = req.body;

  if (!Array.isArray(experiments)) {
    return res.status(400).json({ message: 'Invalid experiments data' });
  }

  const experimentsWithCreator = experiments.map(exp => ({
    ...exp,
    createdBy: req.userId
  }));

  const savedExperiments = await Experiment.insertMany(experimentsWithCreator);

  res.status(201).json({
    message: `${savedExperiments.length} experiments added successfully`,
    experiments: savedExperiments
  });
});

// Get experiments by semester
exports.getExperimentsBySemester = asyncHandler(async (req, res) => {
  const { semester } = req.params;
  const experiments = await Experiment.find({ semester })
    .select('name subject description defaultChemicals')
    .sort({ subject: 1, name: 1 });

  res.status(200).json(experiments);
});

// Get experiment details with usage statistics
exports.getExperimentDetails = asyncHandler(async (req, res) => {
  const { experimentId } = req.params;

  const experiment = await Experiment.findById(experimentId);
  if (!experiment) {
    return res.status(404).json({ message: 'Experiment not found' });
  }

  // Get historical usage data
  const historicalRequests = await Request.find({
    'experiments.experimentName': experiment.name
  }).select('experiments.chemicals');

  // Calculate average usage
  const chemicalUsage = {};
  historicalRequests.forEach(request => {
    request.experiments.forEach(exp => {
      if (exp.experimentName === experiment.name) {
        exp.chemicals.forEach(chem => {
          if (!chemicalUsage[chem.chemicalName]) {
            chemicalUsage[chem.chemicalName] = {
              total: 0,
              count: 0,
              unit: chem.unit
            };
          }
          chemicalUsage[chem.chemicalName].total += chem.quantity;
          chemicalUsage[chem.chemicalName].count += 1;
        });
      }
    });
  });

  // Calculate averages
  const averageUsage = Object.entries(chemicalUsage).map(([name, data]) => ({
    chemicalName: name,
    averageQuantity: data.total / data.count,
    unit: data.unit,
    lastUpdated: new Date()
  }));

  // Update experiment with new averages
  experiment.averageUsage = averageUsage;
  experiment.updatedBy = req.userId;
  await experiment.save();

  res.status(200).json({
    experiment,
    historicalData: {
      totalRequests: historicalRequests.length,
      averageUsage
    }
  });
});

// Update experiment
exports.updateExperiment = asyncHandler(async (req, res) => {
  const { experimentId } = req.params;
  const updates = req.body;

  const experiment = await Experiment.findById(experimentId);
  if (!experiment) {
    return res.status(404).json({ message: 'Experiment not found' });
  }

  // Update fields
  Object.keys(updates).forEach(key => {
    if (key !== 'createdBy' && key !== '_id') {
      experiment[key] = updates[key];
    }
  });

  experiment.updatedBy = req.userId;
  await experiment.save();

  res.status(200).json({
    message: 'Experiment updated successfully',
    experiment
  });
});

// Get suggested chemicals for experiment
exports.getSuggestedChemicals = asyncHandler(async (req, res) => {
  const { experimentId } = req.params;

  const experiment = await Experiment.findById(experimentId);
  if (!experiment) {
    return res.status(404).json({ message: 'Experiment not found' });
  }

  // Combine default chemicals with average usage
  const suggestedChemicals = experiment.defaultChemicals.map(defaultChem => {
    const averageUsage = experiment.averageUsage.find(
      avg => avg.chemicalName === defaultChem.chemicalName
    );

    return {
      ...defaultChem,
      suggestedQuantity: averageUsage ? averageUsage.averageQuantity : defaultChem.quantity
    };
  });

  res.status(200).json({
    defaultChemicals: experiment.defaultChemicals,
    averageUsage: experiment.averageUsage,
    suggestedChemicals
  });
});

// Get all experiments
exports.getExperiments = asyncHandler(async (req, res) => {
  const experiments = await Experiment.find()
    .sort({ semester: 1, subject: 1, name: 1 });
  res.status(200).json(experiments);
});

// Get experiment by ID
exports.getExperimentById = asyncHandler(async (req, res) => {
  const experiment = await Experiment.findById(req.params.id);
  if (!experiment) {
    return res.status(404).json({ message: 'Experiment not found' });
  }
  res.status(200).json(experiment);
});

// Create new experiment
exports.createExperiment = asyncHandler(async (req, res) => {
  const { name, semester, subject, description, defaultChemicals } = req.body;

  const experiment = await Experiment.create({
    name,
    semester,
    subject,
    description,
    defaultChemicals,
    createdBy: req.user.id
  });

  res.status(201).json({
    message: 'Experiment created successfully',
    experiment
  });
});

// Delete experiment
exports.deleteExperiment = asyncHandler(async (req, res) => {
  const experiment = await Experiment.findById(req.params.id);
  if (!experiment) {
    return res.status(404).json({ message: 'Experiment not found' });
  }

  await experiment.deleteOne();
  res.status(200).json({ message: 'Experiment deleted successfully' });
}); 