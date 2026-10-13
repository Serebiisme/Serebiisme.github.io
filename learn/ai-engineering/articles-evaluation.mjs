// 已核读公开正文的原创短提要；不保存或翻译原文全文。
export default [
{slug:'ai-is-only-as-good-as-our-definition-of-done',title:'完成标准：验证器提供迭代信号',summary:'文章用折扣函数和登录功能对比明确检查与模糊目标，建议写出输入输出、异常、性能和仍需人工判断的部分。',extension:'本站补充：测试覆盖不足会产生假完成；模型能力也影响结果，有检查器不保证任务一定能完成。',questions:['evaluation-004','evaluation-005','evaluation-014']},
{slug:'llm-as-a-judge',title:'LLM 裁判：先定义规则，再校准',summary:'文章介绍单答评分、两两比较、参考与 rubric 评价，并列出风格、位置、冗长和自偏好等偏差及人工校准步骤。',extension:'本站校正：特定研究的一致率不能普遍推广；CoT 或换模型家族不保证可靠，需任务级验证。',questions:['evaluation-008','evaluation-009','coding-006']},
{slug:'how-do-image-embeddings-work',title:'图像嵌入：学习空间中的相似度',summary:'文章从像素到 CNN、视觉 Transformer 与向量，演示 CLIP 编码、余弦比较和文本搜图的用途。',extension:'本站校正：跨模态比较需联合对齐；余弦负值不代表语义相反，高相似也不保证对象、数量或细节一致。',questions:['multimodal-003','multimodal-004','multimodal-014']},
{slug:'diffusion-models',title:'扩散生成：从加噪训练到迭代采样',summary:'文章以正向加噪、噪声预测损失与反向采样介绍图像生成，再解释文本条件怎样引导结果。',extension:'本站校正：训练时间步不等于推理步数；去噪器不限 U-Net，少步蒸馏也存在，文本不能保证精确控制。',questions:['multimodal-006','multimodal-028','multimodal-029','multimodal-030']},
{slug:'how-does-semantic-search-work',title:'语义搜索：先建索引，再查近邻',summary:'文章用同义词查询串起文档嵌入、向量索引、查询编码、相似排序与 ANN，并介绍重排和混合检索。',extension:'本站校正：查询与文档须使用兼容空间，双编码器可不同；ANN 召回需实测，余弦分数不是相关性概率。',questions:['coding-003','coding-008','coding-013']},
];
