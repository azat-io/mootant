export default {
  props: { cents: { type: Number, required: true } },
  computed: {
    text(): string {
      return `$${Math.floor(this.cents / 100)}`
    },
  },
}
