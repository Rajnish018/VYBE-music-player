import dotenv from 'dotenv';
import path from 'path';

// Load env variables
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import { megaService } from '../services/megaService';

async function runTest() {
  try {
    console.log('--- Starting MEGA cloud storage integration test ---');
    await megaService.connect();
    
    const storage = (megaService as any).storage;
    if (!storage) {
      throw new Error('Storage instance is not initialized after connect()');
    }

    console.log('Successfully authenticated. Navigating Cloud Drive...');
    
    const root = storage.root;
    console.log(`Root directory name: ${root.name || 'Cloud Drive'}`);
    console.log(`Listing files/folders in root:`);
    
    if (root.children && root.children.length > 0) {
      root.children.forEach((child: any) => {
        console.log(`- [${child.directory ? 'DIR' : 'FILE'}] Name: ${child.name}, NodeID: ${child.nodeId}`);
      });
    } else {
      console.log('(Root folder is empty)');
    }

    console.log('--- MEGA Integration test finished successfully ---');
    process.exit(0);
  } catch (error: any) {
    console.error('CRITICAL: MEGA Integration test failed:', error.message || error);
    process.exit(1);
  }
}

runTest();
