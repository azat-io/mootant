export default function setup({
  provide,
}: {
  provide: (key: string, value: string) => void
}): void {
  provide('flag', process.env.MOOTANT_PROVIDE ?? '')
}
