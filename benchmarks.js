const benchmarks = {
  Geral: {
    minRoas: 2.0,
    minCtr: 1.0,
    maxCpm: 35.0,
    minConnectRate: 70,
    maxFrequency: 3.5,
    targetCPA: 80,
    minSpendForDecision: 50,
    minConversionsForScale: 3,
    goodMessageCost: 10,
    acceptableMessageCost: 20
  },
  'E-commerce': {
    minRoas: 3.0,
    minCtr: 1.2,
    maxCpm: 25.0,
    minConnectRate: 75,
    maxFrequency: 3.0,
    targetCPA: 60,
    minSpendForDecision: 80,
    minConversionsForScale: 4,
    goodMessageCost: 8,
    acceptableMessageCost: 15
  },
  Infoprodutos: {
    minRoas: 2.5,
    minCtr: 1.5,
    maxCpm: 45.0,
    minConnectRate: 80,
    maxFrequency: 4.0,
    targetCPA: 120,
    minSpendForDecision: 70,
    minConversionsForScale: 3,
    goodMessageCost: 15,
    acceptableMessageCost: 25
  },
  'Negócios Locais': {
    minRoas: 1.5,
    minCtr: 0.8,
    maxCpm: 20.0,
    minConnectRate: 60,
    maxFrequency: 2.5,
    targetCPA: 40,
    minSpendForDecision: 40,
    minConversionsForScale: 4,
    goodMessageCost: 7,
    acceptableMessageCost: 15
  },
  'Serviços B2B': {
    minRoas: 2.0,
    minCtr: 0.7,
    maxCpm: 60.0,
    minConnectRate: 70,
    maxFrequency: 3.0,
    targetCPA: 150,
    minSpendForDecision: 100,
    minConversionsForScale: 2,
    goodMessageCost: 20,
    acceptableMessageCost: 40
  },
  Imobiliário: {
    minRoas: 1.0,
    minCtr: 0.5,
    maxCpm: 50.0,
    minConnectRate: 65,
    maxFrequency: 3.0,
    targetCPA: 90,
    minSpendForDecision: 80,
    minConversionsForScale: 2,
    goodMessageCost: 18,
    acceptableMessageCost: 30
  }
};

module.exports = benchmarks;
