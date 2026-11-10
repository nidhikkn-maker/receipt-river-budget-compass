# Receipt River Budget Compass

Build an expense tracking app for business and team expenses featuring a multi-level approval workflow (department manager review followed by finance sign-off), employee expense submissions with receipt attachments, reimbursement status tracking, and department budget analytics. Include role switching to easily test employee, department manager, and finance views.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://receipt-river-budget-compass.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2c178514-2b71-421c-bc9a-e7c5e85ce4db).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Fonts and licences

- **Manrope** (Signature Flow interface typeface) is self-hosted from the `@fontsource-variable/manrope` package (latin and latin-ext subsets, which include the rupee sign). Licence: SIL Open Font License 1.1, copy in `public/fonts/LICENSE-Manrope-OFL.txt`.
- **Noto Sans Devanagari** (Hindi fallback in Signature Flow) is self-hosted from `@fontsource-variable/noto-sans-devanagari`. The browser downloads it only when Devanagari text appears. Licence: SIL Open Font License 1.1, copy in `public/fonts/LICENSE-NotoSansDevanagari-OFL.txt`.
- **Noto Sans Tamil** and **Space Grotesk** still load as before, through the stylesheet link in `src/routes/__root.tsx`.
