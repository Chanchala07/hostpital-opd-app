module.exports = {
  preset: '@react-native/jest-preset',
  // Libraries that ship untranspiled ES modules must go through Babel too.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native(-.*)?|@react-native(-community)?|@react-navigation)/)',
  ],
  // lucide's ESM build is .mjs, which the RN preset doesn't transform; use its CJS build.
  moduleNameMapper: {
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
};
