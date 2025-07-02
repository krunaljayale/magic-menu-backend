module.exports.generateTransactionID = () => {
  return `T${Date.now()}${Math.floor(Math.random() * 1000000)}`;
};


module.exports.generateTicket = () =>{
  return (Math.floor(100000 + Math.random() * 900000));
}