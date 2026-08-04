export default {
  plugins: {
    // Tailwind 4 moved the PostCSS plugin into its own package, and does its own
    // vendor prefixing through Lightning CSS — so autoprefixer is no longer wired
    // in here (the upgrade guide drops it).
    '@tailwindcss/postcss': {},
  },
}
