const mongoose = require('mongoose');
const Experiment = require('../models/Experiment');
const User = require('../models/User');
require('dotenv').config();

// Default chemicals for different types of experiments
const defaultChemicals = {
  pharmaceutics: [
    { chemicalName: 'Sodium Chloride', quantity: 100, unit: 'g' },
    { chemicalName: 'Distilled Water', quantity: 500, unit: 'ml' },
    { chemicalName: 'Ethanol', quantity: 200, unit: 'ml' },
    { chemicalName: 'Glycerin', quantity: 100, unit: 'ml' },
    { chemicalName: 'Propylene Glycol', quantity: 100, unit: 'ml' }
  ],
  chemistry: [
    { chemicalName: 'Hydrochloric Acid', quantity: 100, unit: 'ml' },
    { chemicalName: 'Sodium Hydroxide', quantity: 100, unit: 'g' },
    { chemicalName: 'Ethanol', quantity: 500, unit: 'ml' },
    { chemicalName: 'Acetone', quantity: 200, unit: 'ml' },
    { chemicalName: 'Distilled Water', quantity: 1000, unit: 'ml' }
  ],
  biology: [
    { chemicalName: 'Formalin', quantity: 100, unit: 'ml' },
    { chemicalName: 'Methylene Blue', quantity: 50, unit: 'g' },
    { chemicalName: 'Safranin', quantity: 50, unit: 'g' },
    { chemicalName: 'Distilled Water', quantity: 1000, unit: 'ml' },
    { chemicalName: 'Ethanol', quantity: 500, unit: 'ml' }
  ],
  microbiology: [
    { chemicalName: 'Agar', quantity: 100, unit: 'g' },
    { chemicalName: 'Peptone', quantity: 50, unit: 'g' },
    { chemicalName: 'Sodium Chloride', quantity: 50, unit: 'g' },
    { chemicalName: 'Distilled Water', quantity: 1000, unit: 'ml' },
    { chemicalName: 'Antibiotics', quantity: 10, unit: 'g' }
  ],
  pharmacology: [
    { chemicalName: 'Krebs Solution', quantity: 1000, unit: 'ml' },
    { chemicalName: 'Tyrode Solution', quantity: 1000, unit: 'ml' },
    { chemicalName: 'Acetylcholine', quantity: 10, unit: 'g' },
    { chemicalName: 'Noradrenaline', quantity: 10, unit: 'g' },
    { chemicalName: 'Distilled Water', quantity: 1000, unit: 'ml' }
  ]
};

// Map subjects to chemical types
const subjectChemicalMap = {
  'Pharmaceutics Lab-I': 'pharmaceutics',
  'Pharmaceutics Lab-II': 'pharmaceutics',
  'Physical Pharmaceutics Lab': 'pharmaceutics',
  'Industrial Pharmacy Lab-I': 'pharmaceutics',
  'Cosmeticology Lab': 'pharmaceutics',
  'Organic Chemistry Lab': 'chemistry',
  'Medicinal Chemistry Lab': 'chemistry',
  'Remedial Biology Lab': 'biology',
  'Biochemistry Lab': 'biology',
  'Pharmacognosy Lab': 'biology',
  'Phytochemistry Lab': 'biology',
  'Pharmacology Lab-I': 'pharmacology',
  'Pharmacology Lab-II': 'pharmacology',
  'Pharmacology Lab-III': 'pharmacology',
  'Microbiology Lab': 'microbiology'
};

const bPharmExperiments = [
  {
    semester: "1-1",
    subject: "Pharmaceutics Lab-I",
    experiments: [
      "Preparation of solutions, suspensions, emulsions, and ointments",
      "Filling of capsules and tablets",
      "Preparation of suppositories",
      "Preparation of syrups and lotions",
      "Preparation of powders and granules"
    ]
  },
  {
    semester: "1-1",
    subject: "Remedial Biology Lab",
    experiments: [
      "Microscopic study of plant and animal cells",
      "Identification of plant tissues",
      "Study of human anatomy through charts/models",
      "Dissection of simple animals",
      "Study of human skeletal system"
    ]
  },
  {
    semester: "1-2",
    subject: "Pharmaceutics Lab-II",
    experiments: [
      "Size reduction and sieving",
      "Preparation of suspensions and emulsions",
      "Filtration and centrifugation techniques",
      "Preparation of tablets and capsules",
      "Study of drying methods"
    ]
  },
  {
    semester: "1-2",
    subject: "Organic Chemistry Lab",
    experiments: [
      "Synthesis of organic compounds",
      "Identification of functional groups",
      "Purification techniques (e.g., recrystallization)",
      "Preparation of derivatives",
      "Qualitative organic analysis"
    ]
  },
  {
    semester: "2-1",
    subject: "Physical Pharmaceutics Lab",
    experiments: [
      "Measurement of surface tension",
      "Determination of viscosity",
      "Partition coefficient and solubility studies",
      "pH and buffer capacity",
      "Rheology and sedimentation volume"
    ]
  },
  {
    semester: "2-1",
    subject: "Biochemistry Lab",
    experiments: [
      "Tests for carbohydrates, proteins, and lipids",
      "Estimation of glucose and cholesterol",
      "Enzyme activity studies",
      "Electrophoresis of proteins",
      "Preparation of buffers"
    ]
  },
  {
    semester: "2-1",
    subject: "Pharmacognosy Lab",
    experiments: [
      "Identification of crude drugs",
      "Microscopic evaluation of plant cells",
      "Extraction of plant constituents",
      "Preparation of herbal formulations",
      "Quality testing of crude drugs"
    ]
  },
  {
    semester: "2-2",
    subject: "Cosmeticology Lab",
    experiments: [
      "Preparation of creams, gels, and lotions",
      "Formulation of shampoos and conditioners",
      "Preparation of deodorants and antiperspirants",
      "Formulation of dental products",
      "Evaluation of cosmetic formulations"
    ]
  },
  {
    semester: "2-2",
    subject: "Pharmacology Lab-I",
    experiments: [
      "Drug effect on isolated tissues",
      "LD50 and ED50 determination",
      "Drug interaction studies",
      "Analgesic and anti-inflammatory testing",
      "CNS depressant evaluation"
    ]
  },
  {
    semester: "2-2",
    subject: "Microbiology Lab",
    experiments: [
      "Microorganism isolation and identification",
      "Antibiotic sensitivity testing",
      "Media preparation",
      "Microbial growth curve studies",
      "Immunological tests"
    ]
  },
  {
    semester: "3-1",
    subject: "Industrial Pharmacy Lab-I",
    experiments: [
      "Manufacturing process simulations",
      "Tablet and capsule formulation",
      "Sterile product preparation",
      "Pharmaceutical packaging",
      "Quality assurance techniques"
    ]
  },
  {
    semester: "3-1",
    subject: "Pharmacology Lab-II",
    experiments: [
      "Drug testing on animal models",
      "Cardiovascular drug evaluation",
      "Autonomic drug studies",
      "CNS drug activity (e.g., sedatives)",
      "Antiulcer testing"
    ]
  },
  {
    semester: "3-1",
    subject: "Phytochemistry Lab",
    experiments: [
      "Phytochemical screening",
      "Extraction of plant metabolites",
      "Identification of alkaloids, flavonoids, etc.",
      "Preparation of herbal extracts",
      "Standardization of herbal drugs"
    ]
  },
  {
    semester: "3-2",
    subject: "Medicinal Chemistry Lab",
    experiments: [
      "Synthesis of pharmaceutical compounds",
      "SAR analysis",
      "Purity and stability studies",
      "Spectroscopic characterization",
      "Evaluation of drug analogs"
    ]
  },
  {
    semester: "3-2",
    subject: "Pharmacology Lab-III",
    experiments: [
      "Psychotropic drug analysis",
      "CNS and PNS drug evaluation",
      "Dose-response studies",
      "Assessment of muscle relaxants",
      "Diuretic and antidiabetic drug testing"
    ]
  }
];

async function addExperiments() {
  try {
    // Connect to MongoDB with hardcoded connection string
    await mongoose.connect('mongodb://localhost:27017/pharmacy-lab');
    console.log('Connected to MongoDB');

    // Get admin user for createdBy field
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      // Create admin user if not exists
      const newAdmin = await User.create({
        name: 'System Admin',
        email: 'admin@pharmacy.edu',
        password: 'admin123', // This should be hashed in production
        role: 'admin'
      });
      console.log('Created admin user');
      admin = newAdmin;
    }

    // Process each semester and subject
    for (const semesterData of bPharmExperiments) {
      for (const experiment of semesterData.experiments) {
        const chemicalType = subjectChemicalMap[semesterData.subject];
        if (!chemicalType) {
          console.warn(`No chemical type mapped for subject: ${semesterData.subject}`);
          continue;
        }

        const experimentData = {
          name: experiment,
          semester: semesterData.semester,
          subject: semesterData.subject,
          description: `Laboratory experiment for ${semesterData.subject}`,
          defaultChemicals: defaultChemicals[chemicalType],
          createdBy: admin._id
        };

        // Check if experiment already exists
        const existingExperiment = await Experiment.findOne({
          name: experiment,
          semester: semesterData.semester,
          subject: semesterData.subject
        });

        if (!existingExperiment) {
          await Experiment.create(experimentData);
          console.log(`Added experiment: ${experiment}`);
        } else {
          console.log(`Experiment already exists: ${experiment}`);
        }
      }
    }

    console.log('All experiments added successfully');
  } catch (error) {
    console.error('Error adding experiments:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
addExperiments(); 