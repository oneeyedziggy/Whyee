import Sentiment from 'sentiment';

const analyzer = new Sentiment();

export const scoreSentiment = (noteText: string): number =>
  analyzer.analyze(noteText).comparative;
