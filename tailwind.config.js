 /** @type {import('tailwindcss').Config} */
 export default {
   content: [
     "./index.html",
     "./src/**/*.{js,ts,jsx,tsx}"
   ],
   theme: {
     extend: {
       colors: {
         primary: {
          50: '#fff9e8',
          100: '#fff0bd',
          200: '#fbdc74',
          300: '#fbc405',
          400: '#fbc405',
          500: '#e1a300',
          600: '#a97800',
          700: '#805b00',
          800: '#5d4200',
          900: '#3d2b00'
         }
       }
     }
   },
   plugins: []
 }
