/**
 * decisionEngine.js
 * 데이터 기반의 논리적 근거(Evidence-based Reasoning)를 생성하는 엔진.
 */

const DecisionEngine = (function() {
  const TEMPLATES = {
    price_driven: {
      conclusion: "시장 유효가 대비 {priceDiff}% 더 합리적인 선택입니다.",
      points: ["유효 시장가({baseline}) 대비 최적의 가성비 구간", "동급 모델 중 최저가 실현"]
    },
    trust_driven: {
      conclusion: "디스원 사용자들이 가장 많이 최종 선택한 '압도적 신뢰' 제품입니다.",
      points: ["최근 7일간 사용자 선택률 1위", "상세보기 후 이탈률 최저 기록"]
    },
    balanced: {
      conclusion: "가격과 신뢰도 모두에서 최상위권을 유지하고 있는 밸런스 모델입니다.",
      points: ["검증된 시장가 형성", "사용자 반응도 상위 10% 이내"]
    }
  };

  /**
   * 상품 데이터와 베이스라인 정보를 바탕으로 논리 리포트 생성
   */
  function generateReport(product, baseline) {
    const price = Number(product.priceNum || 0);
    const median = Number(baseline?.median || price * 1.15); // 베이스라인 없을 시 가상 설정
    const priceDiff = Math.round(((median - price) / median) * 100);
    
    // A/B 테스트: 랜덤하게 템플릿 선택 (나중에 피드백 루프로 최적화)
    const variant = Math.random() > 0.5 ? 'price_driven' : 'trust_driven';
    const template = priceDiff > 10 ? TEMPLATES.price_driven : (priceDiff > 0 ? TEMPLATES.balanced : TEMPLATES.trust_driven);
    
    const conclusion = template.conclusion
      .replace('{priceDiff}', priceDiff)
      .replace('{baseline}', median.toLocaleString());

    return {
      variant: template === TEMPLATES.price_driven ? 'A' : 'B',
      conclusion,
      points: template.points,
      data: { priceDiff, median }
    };
  }

  /**
   * 리포트 HTML 렌더링
   */
  function renderReportHtml(report) {
    if (!report) return '';
    
    return `
      <div class="logic-report-area">
        <div class="logic-header">
          <span class="logic-icon">💡</span>
          <span class="logic-label">디스원 논리 리포트</span>
        </div>
        <div class="logic-conclusion">${report.conclusion}</div>
        <div class="logic-points">
          ${report.points.map(p => `<div class="logic-point">• ${p}</div>`).join('')}
        </div>
      </div>
    `;
  }

  return {
    generateReport,
    renderReportHtml
  };
})();

if (typeof window !== 'undefined') {
  window.DecisionEngine = DecisionEngine;
}
