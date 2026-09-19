declare module 'sentiment' {
  interface SentimentResult {
    score: number;
    comparative: number;
  }

  class Sentiment {
    analyze(phrase: string): SentimentResult;
  }

  export = Sentiment;
}
