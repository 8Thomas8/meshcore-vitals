// French counts 0 and 1 as singular, vue-i18n only 1 by default.
export default defineI18nConfig(() => ({
  pluralRules: {
    fr: (choice: number) => Math.abs(choice) < 2 ? 0 : 1
  }
}))
