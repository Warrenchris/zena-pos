// Theme components configuration
export const components = {
  Button: {
    baseStyle: {
      fontWeight: 'medium',
      borderRadius: 'md',
    },
    defaultProps: {
      colorScheme: 'brand',
    },
  },
  Card: {
    baseStyle: {
      container: {
        backgroundColor: 'white',
        borderRadius: 'lg',
        boxShadow: 'sm',
        p: 4,
      },
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