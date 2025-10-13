import { extendTheme } from '@chakra-ui/react';

const config = {
  initialColorMode: 'light',
  useSystemColorMode: true,
};

const styles = {
  global: (props) => ({
    'html, body': {
      backgroundColor: props.colorMode === 'dark' ? 'gray.800' : 'gray.50',
      color: props.colorMode === 'dark' ? 'white' : 'gray.800',
    },
  }),
};

const components = {
  Button: {
    baseStyle: {
      fontWeight: 'medium',
      borderRadius: 'md',
    },
    defaultProps: {
      colorScheme: 'brand',
    },
  },
  Table: {
    variants: {
      simple: {
        th: {
          borderBottom: '1px',
          borderColor: 'gray.200',
          padding: '4',
          textTransform: 'none',
          letterSpacing: 'normal',
        },
        td: {
          borderBottom: '1px',
          borderColor: 'gray.200',
          padding: '4',
        },
      },
    },
  },
};

const colors = {
  brand: {
    50: '#E6F6FF',
    100: '#BAE3FF',
    200: '#7CC4FA',
    300: '#47A3F3',
    400: '#2186EB',
    500: '#0967D2',
    600: '#0552B5',
    700: '#03449E',
    800: '#01337D',
    900: '#002159',
  },
};

const theme = extendTheme({
  config,
  styles,
  colors,
  components,
});

export default theme;