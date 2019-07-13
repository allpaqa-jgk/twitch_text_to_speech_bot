// Function called when the "dice" command is issued
function rollDice (comment) {
  const options = comment.split(' ').slice(1)

  // console.log('options');
  // console.log(options);
  let result = []
  if (options.length === 0) {
    options.push('1d6')
  }
  options.forEach(function(option) {
    let sides = option.match(/\d+d(\d+)/) ? option.match(/\d+d(\d+)/)[1] : 6
    let count = option.match(/(\d+)d\d+/) ? option.match(/(\d+)d\d+/)[1] : 1
    // console.log('option');
    // console.log(option);
    // console.log(sides);
    // console.log(count);

    let tmpResult = []
    for (let index = 0; index < count; index++) {
      tmpResult.push(Math.floor(Math.random() * sides) + 1)
      // console.log(tmpResult);
    }
    return result.push(option + ' => ' + tmpResult.join(' '));
  })
  // console.log(result);

  const message = `DiceRoll: ${result.join(', ')}`
  return message

}
module.exports.rollDice = rollDice