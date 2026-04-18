const PRODUCT_FAMILIES = {
  storage: {
    key: 'storage',
    name: '보관형',
    coreValues: ['capacity', 'efficiency', 'noise', 'stability', 'spaceFit']
  },

  cleaning: {
    key: 'cleaning',
    name: '세척·관리형',
    coreValues: ['performance', 'efficiency', 'noise', 'maintenance', 'capacity']
  },

  environment: {
    key: 'environment',
    name: '환경개선형',
    coreValues: ['performance', 'coverage', 'noise', 'energy', 'runningCost']
  },

  mobility: {
    key: 'mobility',
    name: '이동·휴대형',
    coreValues: ['portability', 'stability', 'durability', 'convenience', 'weight']
  },

  office_output: {
    key: 'office_output',
    name: '출력·사무형',
    coreValues: ['performance', 'runningCost', 'speed', 'reliability', 'convenience']
  },

  wearable_usage: {
    key: 'wearable_usage',
    name: '착용·사용감형',
    coreValues: ['comfort', 'performance', 'durability', 'convenience', 'design']
  },

  cooking_heating: {
    key: 'cooking_heating',
    name: '조리·가열형',
    coreValues: ['performance', 'speed', 'convenience', 'cleanability', 'energy']
  },

  installation_space: {
    key: 'installation_space',
    name: '설치·공간형',
    coreValues: ['spaceFit', 'installation', 'design', 'performance', 'noise']
  },

  generic: {
    key: 'generic',
    name: '일반형',
    coreValues: ['price', 'quality', 'convenience']
  }
};

const CATEGORY_TO_FAMILY = {
  stroller: 'mobility',
  air_purifier: 'environment',
  fan: 'environment',
  printer: 'office_output',
  earphone: 'wearable_usage',
  headphone: 'wearable_usage',
  refrigerator: 'storage',
  washer: 'cleaning',
  dryer: 'cleaning',
  dishwasher: 'cleaning',
  microwave: 'cooking_heating',
  air_fryer: 'cooking_heating',
  tv: 'installation_space',
  air_conditioner: 'installation_space'
};

function getFamilyByKey(familyKey) {
  return PRODUCT_FAMILIES[familyKey] || PRODUCT_FAMILIES.generic;
}

function getFamilyByCategory(categoryKey) {
  const familyKey = CATEGORY_TO_FAMILY[categoryKey] || 'generic';
  return getFamilyByKey(familyKey);
}

window.ThisOneFamilies = {
  PRODUCT_FAMILIES,
  CATEGORY_TO_FAMILY,
  getFamilyByKey,
  getFamilyByCategory
};
