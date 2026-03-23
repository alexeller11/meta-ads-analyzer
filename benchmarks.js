const benchmarks = {
  'Geral': {
    minRoas: 2.0,
    minCtr: 1.0,
    maxCpm: 35.0,
    minConnectRate: 70,
    maxFrequency: 3.5
  },
  'E-commerce': {
    minRoas: 3.0,
    minCtr: 1.2,
    maxCpm: 25.0,
    minConnectRate: 75,
    maxFrequency: 3.0
  },
  'Infoprodutos': {
    minRoas: 2.5,
    minCtr: 1.5,
    maxCpm: 45.0,
    minConnectRate: 80,
    maxFrequency: 4.0
  },
  'Negócios Locais': {
    minRoas: 1.5, // Focado em leads muitas vezes
    minCtr: 0.8,
    maxCpm: 20.0,
    minConnectRate: 60,
    maxFrequency: 2.5
  },
  'Serviços B2B': {
    minRoas: 2.0,
    minCtr: 0.7,
    maxCpm: 60.0,
    minConnectRate: 70,
    maxFrequency: 3.0
  },
  'Imobiliário': {
    minRoas: 1.0, // ROAS direto baixo, foco em lead
    minCtr: 0.5,
    maxCpm: 50.0,
    minConnectRate: 65,
    maxFrequency: 3.0
  }
};

module.exports = benchmarks;
