class FactoryTemplate {
  constructor(factoryKey, factoryMethod, upperBound, seed) {
    this.factoryKey = factoryKey;
    this.factoryMethod = factoryMethod;
    this.upperBound = upperBound;
    this.seed = seed;
  }
}

module.exports.FactoryTemplate = FactoryTemplate;