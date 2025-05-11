// This file is used to configure client-side variables.
// In a real application, you might fetch this configuration or have it injected by the server.

// IMPORTANT: Replace this with your actual HPKV API Base URL.
// You can get this from your HPKV dashboard: https://hpkv.io/dashboard/api-keys
window.HPKV_API_BASE_URL = 'YOUR_HPKV_API_BASE_URL_HERE';

if (window.HPKV_API_BASE_URL === 'YOUR_HPKV_API_BASE_URL_HERE') {
  console.warn('Please update public/config.js with your HPKV_API_BASE_URL.');
  alert('Please update public/config.js with your HPKV_API_BASE_URL for the application to work correctly.');
} 