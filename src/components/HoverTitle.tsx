import { createElement, type ReactNode } from 'react';
import { Platform } from 'react-native';

// react-native-web drops `title` on RN components, so web gets a real DOM wrapper for the tooltip.
export const HoverTitle = ({
  text,
  grow = false,
  children,
}: {
  text: string;
  grow?: boolean;
  children: ReactNode;
}) =>
  Platform.OS === 'web'
    ? createElement(
        'div',
        {
          title: text,
          style: grow
            ? { display: 'flex', flex: '1 1 0%', minWidth: 0 }
            : { display: 'inline-flex' },
        },
        children,
      )
    : children;
