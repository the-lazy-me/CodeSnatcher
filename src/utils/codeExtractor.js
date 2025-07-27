const config = require('../config/config');

/**
 * 从邮件中提取验证码
 * 支持多种常见的验证码格式
 * 
 * @param {Object} emailData 邮件数据
 * @returns {string|null} 提取到的验证码，如果没有找到则返回null
 */
function extractVerificationCode(emailData) {
  const { subject, text, html } = emailData;
  let content = text || '';
  
  // 如果有HTML内容，也将其转换为纯文本进行搜索
  if (html) {
    // 简单地去除HTML标签，这不是最佳方法，但对于简单场景足够了
    const strippedHtml = html.replace(/<[^>]*>/g, ' ');
    content = `${content} ${strippedHtml}`;
  }
  
  // 首先尝试从主题中提取特定格式的验证码
  // 例如 "Welcome to Dreamina and your verification code is Z4SJHS"
  const specificSubjectPatterns = [
    /verification code is\s+([A-Z0-9]{5,6})/i,
    /your verification code is\s+([A-Z0-9]{5,6})/i,
    /verification code is:?\s*([A-Z0-9]{4,8})/i,
    /code is:?\s*([A-Z0-9]{4,8})/i,
    /code:?\s*([A-Z0-9]{4,8})/i,
  ];
  
  for (const pattern of specificSubjectPatterns) {
    const match = subject.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // 合并主题和内容以便搜索
  const fullContent = `${subject} ${content}`;
  
  // 常见的验证码正则表达式模式
  const patterns = [
    // 明确标记为验证码、验证代码、code等的N-M位数字或字母组合
    new RegExp(`(?:验证码|验证代码|校验码|code|Code|CODE)[^\\w\\d]*[：:]\\s*([A-Za-z0-9]{${config.codeExtractor.minCodeLength},${config.codeExtractor.maxCodeLength}})`, 'i'),
    new RegExp(`(?:验证码|验证代码|校验码|code|Code|CODE)[^\\w\\d]*?([A-Za-z0-9]{${config.codeExtractor.minCodeLength},${config.codeExtractor.maxCodeLength}})`, 'i'),
    new RegExp(`(?:your|您的|你的)[^\\w\\d]*(?:验证码|验证代码|校验码|code|Code|CODE)[^\\w\\d]*?([A-Za-z0-9]{${config.codeExtractor.minCodeLength},${config.codeExtractor.maxCodeLength}})`, 'i'),
    
    // 常见的验证码格式：N-M位数字
    new RegExp(`(?:验证码|验证代码|校验码|code|Code|CODE)[^\\w\\d]*[：:]\\s*(\\d{${config.codeExtractor.minCodeLength},${config.codeExtractor.maxCodeLength}})`, 'i'),
    new RegExp(`(?:验证码|验证代码|校验码|code|Code|CODE)[^\\w\\d]*?(\\d{${config.codeExtractor.minCodeLength},${config.codeExtractor.maxCodeLength}})`, 'i'),
    
    // 常见的验证码格式：6位数字（最常见）
    /(?:^|\s)(\d{6})(?:\s|$)/,
    
    // 特定格式的验证码，例如 "verification code is ABCD12"
    /verification code is\s+([A-Za-z0-9]{4,8})/i,
    /your code is\s+([A-Za-z0-9]{4,8})/i,
    /code is\s+([A-Za-z0-9]{4,8})/i,
    
    // 特定于示例中提到的格式
    /verification code is\s+([A-Z0-9]{5,6})/i,
    
    // 常见的验证码格式：4-8位字母数字组合，周围有明显的分隔符
    /(?:^|\s)([A-Za-z0-9]{4,8})(?:\s|$)/,
  ];
  
  // 尝试每一个模式
  for (const pattern of patterns) {
    const match = fullContent.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

module.exports = {
  extractVerificationCode
}; 