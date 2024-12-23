import Random from './index';
const random = Random();
const seed1 = Random.generateSeed();
const seed2 = Random.generateSeed();
const random1 = Random(seed1);
const random2 = Random(seed1);
const random3 = Random(seed2);