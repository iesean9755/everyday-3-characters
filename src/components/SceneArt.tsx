const colors: Record<string, string> = {
  健康: '#b85c45',
  购物: '#b17832',
  出行: '#3f6b7a',
  安全: '#a64b3c',
  手机: '#4e6383',
  场所: '#6b6258',
  医院: '#3f7164',
  银行: '#8b6d35',
  日期: '#596c42',
  饮食: '#a66135',
  家庭: '#7f5b65',
  防骗: '#854b4b',
};

function getDecoration(icon: string, label: string) {
  const isNight = icon.includes('🌙') || label.includes('晚') || label.includes('夜晚') || label.includes('夜');
  const sunColor = isNight ? '#f0f0f0' : '#e3ad58';

  // 默认太阳/月亮
  let decoration = <circle cx="68" cy="52" r="22" fill={sunColor} opacity=".75" />;

  // 时间/早晚/钟表相关 - 画时钟指针
  if (
    label.includes('钟表') ||
    label.includes('时间') ||
    label.includes('早') ||
    label.includes('晚') ||
    icon.includes('🌅') ||
    icon.includes('🌙')
  ) {
    decoration = (
      <g>
        <circle cx="68" cy="52" r="22" fill={sunColor} opacity=".75" />
        {/* 时钟指针 */}
        <line x1="68" y1="52" x2="68" y2="35" stroke="#333" strokeWidth="3" strokeLinecap="round" />
        <line x1="68" y1="52" x2="82" y2="52" stroke="#333" strokeWidth="2" strokeLinecap="round" />
        <circle cx="68" cy="52" r="3" fill="#333" />
      </g>
    );
  }

  // 钱/购物/价格/秤相关 - 画金币
  if (
    label.includes('钱') ||
    label.includes('元') ||
    label.includes('价格') ||
    label.includes('秤') ||
    icon.includes('💰') ||
    icon.includes('💵') ||
    icon.includes('⚖️')
  ) {
    decoration = (
      <g>
        <circle cx="68" cy="52" r="22" fill="#ffd700" opacity=".85" />
        <circle cx="50" cy="40" r="10" fill="#ffec8b" opacity=".7" />
        <circle cx="85" cy="65" r="10" fill="#ffec8b" opacity=".7" />
        <text x="68" y="58" textAnchor="middle" fontSize="18" fill="#b8860b" fontWeight="bold">$</text>
      </g>
    );
  }

  // 安全/警示/危险/火焰/电相关 - 画警告三角
  if (
    label.includes('危险') ||
    label.includes('警示') ||
    label.includes('火焰') ||
    label.includes('电') ||
    label.includes('插座') ||
    icon.includes('🔥') ||
    icon.includes('⚠️')
  ) {
    decoration = (
      <g>
        <polygon points="68,28 42,72 94,72" fill="#ffcc00" stroke="#333" strokeWidth="3" />
        <text x="68" y="60" textAnchor="middle" fontSize="28" fill="#333" fontWeight="bold">!</text>
      </g>
    );
  }

  // 健康/药/医院/医生相关 - 画药箱十字
  if (
    label.includes('药') ||
    label.includes('医生') ||
    label.includes('医院') ||
    label.includes('病历') ||
    icon.includes('💊') ||
    icon.includes('🩺')
  ) {
    decoration = (
      <g>
        <rect x="52" y="38" width="32" height="28" rx="4" fill="#fff" stroke="#e74c3c" strokeWidth="4" />
        <line x1="68" y1="38" x2="68" y2="66" stroke="#e74c3c" strokeWidth="5" />
        <line x1="52" y1="52" x2="84" y2="52" stroke="#e74c3c" strokeWidth="5" />
      </g>
    );
  }

  return decoration;
}

export function SceneArt({
  icon,
  theme,
  label,
  onClick,
}: {
  icon: string;
  theme: string;
  label: string;
  onClick?: () => void;
}) {
  const sceneColor = colors[theme] ?? '#315c4c';
  const decoration = getDecoration(icon, label);

  return (
    <button
      className="scene-art"
      style={{ '--scene': sceneColor } as React.CSSProperties}
      onClick={onClick}
      aria-label={`生活场景：${label}，点击重听`}
    >
      <svg viewBox="0 0 360 180" role="img" aria-label={label}>
        <rect
          x="6"
          y="6"
          width="348"
          height="168"
          rx="28"
          fill="#fffaf0"
          stroke="var(--scene)"
          strokeWidth="6"
        />
        <path
          d="M28 144 Q92 104 152 140 T332 132 V166 H28Z"
          fill="var(--scene)"
          opacity=".16"
        />
        {decoration}
        <text
          x="180"
          y="120"
          textAnchor="middle"
          fontSize="82"
          aria-hidden="true"
        >
          {icon}
        </text>
      </svg>
    </button>
  );
}
