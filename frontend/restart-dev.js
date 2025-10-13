#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 Restarting development server...');

// Kill any existing dev server processes
exec('taskkill /f /im node.exe', (error) => {
  if (error) {
    console.log('No existing Node processes to kill');
  }
  
  // Wait a moment then start the dev server
  setTimeout(() => {
    console.log('🚀 Starting development server...');
    exec('npm run dev', (error, stdout, stderr) => {
      if (error) {
        console.error('Error starting dev server:', error);
        return;
      }
      console.log(stdout);
      if (stderr) console.error(stderr);
    });
  }, 2000);
});
