const targetValue = 'link, name: "Sign In"';
const match = targetValue.match(/^([^,]+),\s*name:\s*["'](.+)["']$/)
console.log("match:", match);
if (match) {
  console.log("role:", match[1].trim());
  console.log("name:", match[2]);
} else {
  console.log("No match found!");
}
