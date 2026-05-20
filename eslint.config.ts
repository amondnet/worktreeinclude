import pleaseai from '@pleaseai/eslint-config'

export default pleaseai({
  ignores: [
    'node_modules',
    'dist',
    'coverage',
    'test/fixtures/**',
  ],
})
