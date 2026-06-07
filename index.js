const ejs = require('ejs');
const qrcode = require('qrcode');
const fs = require('fs');

async function generateTicket() {
  const customerName = 'John Doe';
  const eventName = 'Gym Day-Pass';
  const ticketId = 'TKT-12345';
  
  // Set expiry to 10 seconds from now for demonstration
  const now = new Date();
  const expiryDate = new Date(now.getTime() + 10 * 1000); 
  const expiryTimestamp = expiryDate.getTime();
  const expiryDateString = expiryDate.toLocaleTimeString();

  // Generate QR code SVG string
  const qrCodeData = JSON.stringify({ ticketId, customerName });
  const qrCodeSvg = await qrcode.toString(qrCodeData, {
    type: 'svg',
    width: 250, // width in pixels
    margin: 1,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
  
  const templateData = {
    eventName,
    customerName,
    qrCodeSvg,
    expiryTimestamp,
    expiryDateString
  };

  // Render EJS
  const templatePath = './ticket.ejs';
  const templateString = fs.readFileSync(templatePath, 'utf8');
  const finalSvg = ejs.render(templateString, templateData);

  // Save SVG
  fs.writeFileSync('./ticket.svg', finalSvg);
  console.log(`Ticket generated successfully as ticket.svg. It will expire at ${expiryDateString}`);
}

generateTicket().catch(console.error);
