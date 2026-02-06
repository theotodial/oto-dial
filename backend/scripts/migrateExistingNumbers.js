/**
 * Migration script to add country metadata to existing phone numbers
 * Run this once to update existing numbers with country information
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PhoneNumber from '../src/models/PhoneNumber.js';
import { detectCountryFromPhoneNumber, getCountryByCode } from '../src/utils/countryUtils.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/oto-dial';

async function migrateExistingNumbers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all phone numbers without country metadata
    const numbers = await PhoneNumber.find({
      $or: [
        { countryCode: { $exists: false } },
        { countryCode: null },
        { iso2: { $exists: false } },
        { iso2: null }
      ]
    });

    console.log(`\nFound ${numbers.length} numbers to migrate\n`);

    let updated = 0;
    let skipped = 0;

    for (const number of numbers) {
      try {
        // Try to detect country from phone number
        let countryCode = detectCountryFromPhoneNumber(number.phoneNumber);
        
        // If not detected, default to US (for backward compatibility)
        if (!countryCode) {
          countryCode = 'US';
        }

        const countryInfo = getCountryByCode(countryCode);
        
        if (!countryInfo) {
          console.warn(`⚠️  Could not find country info for code: ${countryCode}, defaulting to US`);
          countryCode = 'US';
          const usInfo = getCountryByCode('US');
          
          number.countryCode = usInfo.code;
          number.countryName = usInfo.name;
          number.iso2 = usInfo.iso2;
          number.lockedCountry = true;
          
          if (!number.country || number.country === 'United States') {
            number.country = usInfo.name;
          }
        } else {
          number.countryCode = countryInfo.code;
          number.countryName = countryInfo.name;
          number.iso2 = countryInfo.iso2;
          number.lockedCountry = true;
          
          if (!number.country) {
            number.country = countryInfo.name;
          }
        }

        await number.save();
        updated++;
        console.log(`✅ Updated ${number.phoneNumber}: ${number.countryName} (${number.countryCode})`);
      } catch (err) {
        console.error(`❌ Error updating ${number.phoneNumber}:`, err.message);
        skipped++;
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${numbers.length}\n`);

  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrateExistingNumbers();
