import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the option editor', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument();
  expect(screen.getByText('Select one')).toBeInTheDocument();
});
