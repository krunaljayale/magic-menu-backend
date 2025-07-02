module.exports.convertToIST = (utcDate) => {
  return new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
};