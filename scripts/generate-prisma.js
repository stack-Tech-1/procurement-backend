import { execSync } from 'child_process';

console.log('Attempting to generate Prisma client via exec...');
try {
  // Use npx here, as running via execSync is more reliable than direct sh execution
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma client generated successfully!');
} catch (error) {
  console.error('❌ Failed to run prisma generate:', error.message);
  // Exit with status 1 to fail the build if generation fails
  process.exit(1); 
}