const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Read the book text file
const bookText = fs.readFileSync(path.join(__dirname, '../data/TheDailyStoic.txt'), 'utf8');

// Create database
const db = new sqlite3.Database('daily-stoic.db');

// Create table
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS meditations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    day INTEGER NOT NULL,
    title TEXT NOT NULL,
    quote TEXT NOT NULL,
    reference TEXT NOT NULL,
    context TEXT NOT NULL,
    date_key TEXT UNIQUE NOT NULL
  )`);
});

function parseBook() {
  const lines = bookText.split('\n');
  const meditations = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this is a date/title line
    const dateMatch = line.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)(?:st|nd|rd|th)\s+(.+)$/);
    
    if (dateMatch) {
      const [, month, day, title] = dateMatch;
      
      const meditation = {
        month: month,
        day: parseInt(day),
        title: title,
        quote: '',
        reference: '',
        context: '',
        date_key: `${month.toLowerCase()}-${day.padStart(2, '0')}`
      };
      
      // Look for quote in the next few lines
      let j = i + 1;
      let quoteLines = [];
      let foundReference = false;
      
      // Collect quote lines until we find the reference
      while (j < lines.length && j < i + 10) {
        const currentLine = lines[j].trim();
        
        if (!currentLine) {
          j++;
          continue;
        }
        
        // Add line to quote
        quoteLines.push(currentLine);
        
        // Check if this line contains the reference (ends with —AUTHOR)
        if (currentLine.includes('—')) {
          foundReference = true;
          
          // Combine all quote lines
          const fullQuote = quoteLines.join(' ');
          
          // Split at the last —
          const lastDashIndex = fullQuote.lastIndexOf('—');
          if (lastDashIndex > 0) {
            let quoteText = fullQuote.substring(0, lastDashIndex).trim();
            let reference = fullQuote.substring(lastDashIndex + 1).trim();
            
            // Clean up quote (remove surrounding quotes)
            quoteText = quoteText.replace(/^"/, '').replace(/"$/, '');
            
            meditation.quote = quoteText;
            meditation.reference = reference;
          }
          
          j++; // Move past quote section
          break;
        }
        
        j++;
      }
      
      if (!foundReference) {
        continue; // Skip this meditation if we couldn't parse it properly
      }
      
      // Collect context lines until the next meditation
      let contextLines = [];
      while (j < lines.length) {
        const contextLine = lines[j].trim();
        
        if (!contextLine) {
          j++;
          continue;
        }
        
        // Stop if we hit the next meditation
        if (contextLine.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+(?:st|nd|rd|th)\s+/)) {
          break;
        }
        
        contextLines.push(contextLine);
        j++;
      }
      
      meditation.context = contextLines.join(' ').trim();
      
      // Only add if we have all parts
      if (meditation.quote && meditation.reference && meditation.context) {
        meditations.push(meditation);
      }
      
      i = j - 1; // Move the main loop forward
    }
  }
  
  return meditations;
}

function insertMeditations(meditations) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Clear existing data
      db.run("DELETE FROM meditations", (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        const stmt = db.prepare(`INSERT INTO meditations 
          (month, day, title, quote, reference, context, date_key) 
          VALUES (?, ?, ?, ?, ?, ?, ?)`);
        
        let completed = 0;
        const total = meditations.length;
        
        meditations.forEach(meditation => {
          stmt.run([
            meditation.month,
            meditation.day,
            meditation.title,
            meditation.quote,
            meditation.reference,
            meditation.context,
            meditation.date_key
          ], (err) => {
            if (err) {
              console.error('Error inserting meditation:', err);
            }
            completed++;
            if (completed === total) {
              stmt.finalize();
              resolve();
            }
          });
        });
      });
    });
  });
}

// Parse and insert meditations
console.log('Parsing The Daily Stoic...');
const meditations = parseBook();

console.log(`Extracted ${meditations.length} meditations`);

// Show first few for verification
meditations.slice(0, 3).forEach((med, i) => {
  console.log(`\n=== Meditation ${i + 1} ===`);
  console.log(`Date: ${med.month} ${med.day}`);
  console.log(`Title: ${med.title}`);
  console.log(`Quote: ${med.quote.substring(0, 100)}...`);
  console.log(`Reference: ${med.reference}`);
  console.log(`Context: ${med.context.substring(0, 100)}...`);
});

insertMeditations(meditations)
  .then(() => {
    console.log('\nSuccessfully inserted all meditations into database!');
    db.close();
  })
  .catch(err => {
    console.error('Error inserting meditations:', err);
    db.close();
  }); 