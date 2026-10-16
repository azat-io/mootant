import vue from '@vitejs/plugin-vue'

export default {
  test: {
    include: ['test/**/*.test.ts'],
  },
  plugins: [vue()],
}
