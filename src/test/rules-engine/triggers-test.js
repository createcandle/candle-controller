const Triggers = require('../../rules-engine/triggers/index');

const booleanTrigger = {
  property: {
    type: 'boolean',
    thing: 'light1',
    id: 'on',
  },
  type: 'BooleanTrigger',
  onValue: true,
};

const levelTrigger = {
  property: {
    type: 'number',
    thing: 'light2',
    id: 'hue',
  },
  type: 'LevelTrigger',
  levelType: 'LESS',
  value: 120,
};

const equalityTrigger = {
  property: {
    type: 'string',
    thing: 'light2',
    id: 'color',
  },
  type: 'EqualityTrigger',
  value: '#ff7700',
};

const andTrigger = {
  triggers: [
    booleanTrigger,
    levelTrigger,
  ],
  type: 'MultiTrigger',
  op: 'AND',
};


describe('triggers', () => {
  it('should parse a BooleanTrigger', () => {
    const trigger = Triggers.fromDescription(booleanTrigger);
    expect(trigger).toMatchObject(booleanTrigger);
  });

  it('should parse a LevelTrigger', () => {
    const trigger = Triggers.fromDescription(levelTrigger);
    expect(trigger).toMatchObject(levelTrigger);
  });

  it('should parse an EqualityTrigger', () => {
    const trigger = Triggers.fromDescription(equalityTrigger);
    expect(trigger).toMatchObject(equalityTrigger);
  });

  it('should parse a MultiTrigger', () => {
    const trigger = Triggers.fromDescription(andTrigger);
    expect(trigger).toMatchObject(andTrigger);
  });

  it('should reject an unknown trigger type', () => {
    let err = null;
    try {
      Triggers.fromDescription({type: 'LimaTrigger'});
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
  });

  it('should reject a number type onValue', () => {
    let err = null;
    try {
      Triggers.fromDescription(Object.assign(
        {},
        booleanTrigger,
        {onValue: 12}
      ));
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
  });

  it('should reject a boolean type level', () => {
    let err = null;
    try {
      Triggers.fromDescription(Object.assign(
        {},
        levelTrigger,
        {value: true}
      ));
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
  });

  it('should reject an unknown levelType', () => {
    let err = null;
    try {
      Triggers.fromDescription(Object.assign(
        {},
        levelTrigger,
        {levelType: 'GARBANZO'}
      ));
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
  });


  it('should reject an trigger without a property', () => {
    let err = null;
    try {
      const brokenTrigger = Object.assign(
        {},
        levelTrigger
      );
      delete brokenTrigger.property;

      Triggers.fromDescription(brokenTrigger);
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
  });
});

